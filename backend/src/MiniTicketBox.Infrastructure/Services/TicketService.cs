using Microsoft.EntityFrameworkCore;
using MiniTicketBox.Application.Contracts.Requests;
using MiniTicketBox.Application.Contracts.Responses;
using MiniTicketBox.Application.Interfaces;
using MiniTicketBox.Domain.Entities;
using MiniTicketBox.Infrastructure.Persistence;
using StackExchange.Redis;

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
}