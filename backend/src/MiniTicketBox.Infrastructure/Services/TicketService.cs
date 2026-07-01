using Microsoft.EntityFrameworkCore;
using MiniTicketBox.Application.Contracts.Requests;
using MiniTicketBox.Application.Contracts.Responses;
using MiniTicketBox.Application.Interfaces;
using MiniTicketBox.Domain.Entities;
using MiniTicketBox.Infrastructure.Persistence;
using StackExchange.Redis;
using MiniTicketBox.Domain.Enums;
using MiniTicketBox.Application.Realtime;
using System.Text.RegularExpressions;

namespace MiniTicketBox.Infrastructure.Services;

public class TicketService : ITicketService
{
    private static readonly Regex EmailRegex = new(
        @"^[^\s@]+@[^\s@]+\.[^\s@]+$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private readonly TicketDbContext _dbContext;
    private readonly IConnectionMultiplexer _redis;
    private readonly ITicketRealtimeNotifier _realtimeNotifier;

    public TicketService(
        TicketDbContext dbContext,
        IConnectionMultiplexer redis,
        ITicketRealtimeNotifier realtimeNotifier)
    {
        _dbContext = dbContext;
        _redis = redis;
        _realtimeNotifier = realtimeNotifier;
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

        await BroadcastInventoryChangedAsync("reserved", cancellationToken);

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

    public async Task<TicketInventorySnapshotResponse> GetInventorySnapshotAsync(
        CancellationToken cancellationToken = default)
    {
        var ticketTypes = await GetTicketTypesAsync(cancellationToken);
        var totalHolding = await _dbContext.TicketHolds
            .AsNoTracking()
            .Where(x => x.Status == HoldStatus.Holding && x.ExpiredAt > DateTime.UtcNow)
            .SumAsync(x => x.Quantity, cancellationToken);

        var revenue = await _dbContext.Orders
            .AsNoTracking()
            .Where(x => x.Status == OrderStatus.Paid)
            .SumAsync(x => (decimal?)x.TotalAmount, cancellationToken) ?? 0;

        var totalSold = await _dbContext.Orders
            .AsNoTracking()
            .Where(x => x.Status == OrderStatus.Paid)
            .SelectMany(x => x.Items)
            .SumAsync(x => (int?)x.Quantity, cancellationToken) ?? 0;

        return new TicketInventorySnapshotResponse
        {
            ServerTimeUtc = DateTime.UtcNow,
            TicketTypes = ticketTypes,
            TotalAvailable = ticketTypes.Sum(x => x.AvailableQuantity),
            TotalHolding = totalHolding,
            TotalSold = totalSold,
            Revenue = revenue
        };
    }

    public async Task<AdminDashboardResponse> GetAdminDashboardAsync(
        CancellationToken cancellationToken = default)
    {
        var snapshot = await GetInventorySnapshotAsync(cancellationToken);
        var activeHolds = await _dbContext.TicketHolds
            .AsNoTracking()
            .Include(x => x.TicketType)
            .Where(x => x.Status == HoldStatus.Holding && x.ExpiredAt > DateTime.UtcNow)
            .OrderBy(x => x.ExpiredAt)
            .Select(x => new ActiveTicketHoldResponse
            {
                Id = x.Id,
                HoldCode = x.HoldCode,
                TicketTypeId = x.TicketTypeId,
                TicketTypeName = x.TicketType == null ? string.Empty : x.TicketType.Name,
                Quantity = x.Quantity,
                ExpiredAt = x.ExpiredAt
            })
            .ToListAsync(cancellationToken);

        return new AdminDashboardResponse
        {
            TotalSold = snapshot.TotalSold,
            TotalHolding = snapshot.TotalHolding,
            Revenue = snapshot.Revenue,
            ServerTimeUtc = snapshot.ServerTimeUtc,
            ActiveHolds = activeHolds
        };
    }

    public async Task<PaymentResponse> PayAsync(
    PaymentRequest request,
    CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.HoldCode))
            throw new ArgumentException("Hold code is required.");

        var customerName = request.CustomerName.Trim();
        var customerEmail = request.CustomerEmail.Trim();

        if (customerName.Length < 2)
            throw new ArgumentException("Customer name is required.");

        if (!EmailRegex.IsMatch(customerEmail))
            throw new ArgumentException("A valid customer email is required.");

        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

        var hold = await _dbContext.TicketHolds
            .FromSqlInterpolated($"""
                SELECT *
                FROM "TicketHolds"
                WHERE "HoldCode" = {request.HoldCode}
                FOR UPDATE
                """)
            .Include(x => x.TicketType)
            .FirstOrDefaultAsync(cancellationToken);

        if (hold is null)
            throw new InvalidOperationException("Ticket hold not found.");

        if (hold.Status != HoldStatus.Holding)
            throw new InvalidOperationException("Ticket hold is not available for payment.");

        if (hold.ExpiredAt <= DateTime.UtcNow)
            throw new InvalidOperationException("Ticket hold has expired.");

        if (hold.TicketType is null)
            throw new InvalidOperationException("Ticket type not found.");

        var totalAmount = hold.Quantity * hold.TicketType.Price;

        var order = new MiniTicketBox.Domain.Entities.Order(
            totalAmount,
            customerName,
            customerEmail);

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

        await BroadcastInventoryChangedAsync("paid", cancellationToken);

        return new PaymentResponse
        {
            OrderCode = order.OrderCode,
            TotalAmount = order.TotalAmount,
            Status = order.Status.ToString()
        };
    }

    private async Task BroadcastInventoryChangedAsync(
        string reason,
        CancellationToken cancellationToken)
    {
        var snapshot = await GetInventorySnapshotAsync(cancellationToken);
        await _realtimeNotifier.BroadcastInventoryChangedAsync(reason, snapshot, cancellationToken);
    }
}
