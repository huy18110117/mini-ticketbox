using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MiniTicketBox.Application.Common;
using MiniTicketBox.Application.Contracts.Requests;
using MiniTicketBox.Application.Contracts.Responses;
using MiniTicketBox.Application.Interfaces;
using MiniTicketBox.Application.Realtime;
using MiniTicketBox.Domain.Entities;
using MiniTicketBox.Domain.Enums;
using MiniTicketBox.Infrastructure.Persistence;
using StackExchange.Redis;
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
    private readonly TicketHoldOptions _holdOptions;

    public TicketService(
        TicketDbContext dbContext,
        IConnectionMultiplexer redis,
        ITicketRealtimeNotifier realtimeNotifier,
        IOptions<TicketHoldOptions> holdOptions)
    {
        _dbContext = dbContext;
        _redis = redis;
        _realtimeNotifier = realtimeNotifier;
        _holdOptions = holdOptions.Value;
    }

    public async Task<ReserveTicketResponse> ReserveAsync(
        ReserveTicketRequest request,
        CancellationToken cancellationToken = default)
    {
        if (request.TicketTypeId == Guid.Empty)
            throw new AppException(ErrorCodes.TicketTypeRequired, ErrorMessages.TicketTypeRequired);

        if (request.Quantity <= 0)
            throw new AppException(ErrorCodes.QuantityInvalid, ErrorMessages.QuantityInvalid);

        var strategy = _dbContext.Database.CreateExecutionStrategy();

        var response = await strategy.ExecuteAsync(async () =>
        {
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
                throw new AppException(ErrorCodes.TicketTypeNotFound, ErrorMessages.TicketTypeNotFound, 404);

            if (ticketType.AvailableQuantity < request.Quantity)
                throw new AppException(ErrorCodes.NotEnoughTickets, ErrorMessages.NotEnoughTickets, 409);

            ticketType.Reserve(request.Quantity);

            var serverTimeUtc = DateTime.UtcNow;
            var expiredAt = serverTimeUtc.Add(_holdOptions.HoldDuration);

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
                expiry: _holdOptions.HoldDuration
            );

            await transaction.CommitAsync(cancellationToken);

            return new ReserveTicketResponse
            {
                HoldCode = ticketHold.HoldCode,
                ExpiredAt = ticketHold.ExpiredAt,
                ServerTimeUtc = serverTimeUtc
            };
        });

        await BroadcastInventoryChangedAsync("reserved", cancellationToken);

        return response;
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
            throw new AppException(ErrorCodes.HoldCodeRequired, ErrorMessages.HoldCodeRequired);

        var customerName = request.CustomerName.Trim();
        var customerEmail = request.CustomerEmail.Trim();

        if (customerName.Length < 2)
            throw new AppException(ErrorCodes.CustomerNameRequired, ErrorMessages.CustomerNameRequired);

        if (!EmailRegex.IsMatch(customerEmail))
            throw new AppException(ErrorCodes.CustomerEmailInvalid, ErrorMessages.CustomerEmailInvalid);

        var strategy = _dbContext.Database.CreateExecutionStrategy();

        var response = await strategy.ExecuteAsync(async () =>
        {
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
                throw new AppException(ErrorCodes.TicketHoldNotFound, ErrorMessages.TicketHoldNotFound, 404);

            if (hold.Status != HoldStatus.Holding)
                throw new AppException(ErrorCodes.TicketHoldPaymentUnavailable, ErrorMessages.TicketHoldPaymentUnavailable, 409);

            if (hold.ExpiredAt <= DateTime.UtcNow)
                throw new AppException(ErrorCodes.TicketHoldExpired, ErrorMessages.TicketHoldExpired, 409);

            if (hold.TicketType is null)
                throw new AppException(ErrorCodes.TicketTypeNotFound, ErrorMessages.TicketTypeNotFound, 404);

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

            return new PaymentResponse
            {
                OrderCode = order.OrderCode,
                TotalAmount = order.TotalAmount,
                Status = order.Status.ToString()
            };
        });

        await BroadcastInventoryChangedAsync("paid", cancellationToken);

        return response;
    }

    public async Task CancelHoldAsync(
        CancelTicketHoldRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.HoldCode))
            throw new AppException(ErrorCodes.HoldCodeRequired, ErrorMessages.HoldCodeRequired);

        var strategy = _dbContext.Database.CreateExecutionStrategy();

        await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

            var hold = await _dbContext.TicketHolds
                .FromSqlInterpolated($"""
                    SELECT *
                    FROM "TicketHolds"
                    WHERE "HoldCode" = {request.HoldCode.Trim()}
                    FOR UPDATE
                    """)
                .FirstOrDefaultAsync(cancellationToken);

            if (hold is null)
                throw new AppException(ErrorCodes.TicketHoldNotFound, ErrorMessages.TicketHoldNotFound, 404);

            if (hold.Status != HoldStatus.Holding)
                throw new AppException(ErrorCodes.TicketHoldCancellationUnavailable, ErrorMessages.TicketHoldCancellationUnavailable, 409);

            if (hold.ExpiredAt <= DateTime.UtcNow)
                throw new AppException(ErrorCodes.TicketHoldExpired, ErrorMessages.TicketHoldExpired, 409);

            var ticketType = await _dbContext.TicketTypes
                .FromSqlInterpolated($"""
                    SELECT *
                    FROM "TicketTypes"
                    WHERE "Id" = {hold.TicketTypeId}
                    FOR UPDATE
                    """)
                .FirstOrDefaultAsync(cancellationToken);

            if (ticketType is null)
                throw new AppException(ErrorCodes.TicketTypeNotFound, ErrorMessages.TicketTypeNotFound, 404);

            ticketType.Release(hold.Quantity);
            hold.Release();

            await _dbContext.SaveChangesAsync(cancellationToken);

            var redisDb = _redis.GetDatabase();
            await redisDb.KeyDeleteAsync($"ticket-hold:{hold.HoldCode}");

            await transaction.CommitAsync(cancellationToken);
        });

        await BroadcastInventoryChangedAsync("cancelled", cancellationToken);
    }

    private async Task BroadcastInventoryChangedAsync(
        string reason,
        CancellationToken cancellationToken)
    {
        var snapshot = await GetInventorySnapshotAsync(cancellationToken);
        await _realtimeNotifier.BroadcastInventoryChangedAsync(reason, snapshot, cancellationToken);
    }
}
