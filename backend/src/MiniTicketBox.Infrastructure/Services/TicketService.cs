using Microsoft.EntityFrameworkCore;
using MiniTicketBox.Application.Contracts.Requests;
using MiniTicketBox.Application.Contracts.Responses;
using MiniTicketBox.Application.Interfaces;
using MiniTicketBox.Domain.Entities;
using MiniTicketBox.Infrastructure.Persistence;
using StackExchange.Redis;
using MiniTicketBox.Domain.Enums;

namespace MiniTicketBox.Infrastructure.Services;

public class TicketService : ITicketService
{
    private readonly TicketDbContext _dbContext;
    private readonly IConnectionMultiplexer _redis;

    public TicketService(
        TicketDbContext dbContext,
        IConnectionMultiplexer redis)
    {
        _dbContext = dbContext;
        _redis = redis;
    }

    public async Task<ReserveTicketResponse> ReserveAsync(
        ReserveTicketRequest request,
        CancellationToken cancellationToken = default)
    {
        if (request.TicketTypeId == Guid.Empty)
            throw new ArgumentException("Ticket type id is required.");

        if (request.Quantity <= 0)
            throw new ArgumentException("Quantity must be greater than zero.");

        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

        var ticketType = await _dbContext.TicketTypes
            .FromSqlInterpolated($"""
                SELECT *
                FROM "TicketTypes"
                WHERE "Id" = {request.TicketTypeId}
                FOR UPDATE
                """)
            .FirstOrDefaultAsync(cancellationToken);

        if (ticketType is null)
            throw new InvalidOperationException("Ticket type not found.");

        if (ticketType.AvailableQuantity < request.Quantity)
            throw new InvalidOperationException("Not enough tickets available.");

        ticketType.Reserve(request.Quantity);

        var expiredAt = DateTime.UtcNow.AddMinutes(5);

        var ticketHold = new TicketHold(
            ticketType.Id,
            request.Quantity,
            expiredAt
        );

        await _dbContext.TicketHolds.AddAsync(ticketHold, cancellationToken);

        await _dbContext.SaveChangesAsync(cancellationToken);

        var redisDb = _redis.GetDatabase();

        var redisKey = $"ticket-hold:{ticketHold.HoldCode}";

        await redisDb.StringSetAsync(
            redisKey,
            ticketHold.Id.ToString(),
            expiry: TimeSpan.FromMinutes(5)
        );

        await transaction.CommitAsync(cancellationToken);

        return new ReserveTicketResponse
        {
            HoldCode = ticketHold.HoldCode,
            ExpiredAt = ticketHold.ExpiredAt
        };
    }
    public async Task<List<TicketTypeResponse>> GetTicketTypesAsync(
    CancellationToken cancellationToken = default)
    {
        return await _dbContext.TicketTypes
            .AsNoTracking()
            .OrderBy(x => x.Price)
            .Select(x => new TicketTypeResponse
            {
                Id = x.Id,
                Name = x.Name,
                Price = x.Price,
                TotalQuantity = x.TotalQuantity,
                AvailableQuantity = x.AvailableQuantity
            })
            .ToListAsync(cancellationToken);
    }
    public async Task<PaymentResponse> PayAsync(
    PaymentRequest request,
    CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.HoldCode))
            throw new ArgumentException("Hold code is required.");

        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

        var hold = await _dbContext.TicketHolds
            .Include(x => x.TicketType)
            .FirstOrDefaultAsync(x => x.HoldCode == request.HoldCode, cancellationToken);

        if (hold is null)
            throw new InvalidOperationException("Ticket hold not found.");

        if (hold.Status != HoldStatus.Holding)
            throw new InvalidOperationException("Ticket hold is not available for payment.");

        if (hold.ExpiredAt <= DateTime.UtcNow)
            throw new InvalidOperationException("Ticket hold has expired.");

        if (hold.TicketType is null)
            throw new InvalidOperationException("Ticket type not found.");

        var totalAmount = hold.Quantity * hold.TicketType.Price;

        var order = new MiniTicketBox.Domain.Entities.Order(totalAmount);

        var orderItem = new OrderItem(
            hold.TicketTypeId,
            hold.Quantity,
            hold.TicketType.Price
        );

        order.AddItem(orderItem);
        order.MarkAsPaid();
        hold.MarkAsPaid();

        await _dbContext.Orders.AddAsync(order, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);

        var redisDb = _redis.GetDatabase();
        await redisDb.KeyDeleteAsync($"ticket-hold:{hold.HoldCode}");

        await transaction.CommitAsync(cancellationToken);

        return new PaymentResponse
        {
            OrderCode = order.OrderCode,
            TotalAmount = order.TotalAmount,
            Status = order.Status.ToString()
        };
    }
}