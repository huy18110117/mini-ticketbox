using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MiniTicketBox.Application.Interfaces;
using MiniTicketBox.Application.Realtime;
using MiniTicketBox.Domain.Enums;
using MiniTicketBox.Infrastructure.Persistence;
using StackExchange.Redis;

namespace MiniTicketBox.Infrastructure.BackgroundServices;

public class ExpiredTicketHoldBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ExpiredTicketHoldBackgroundService> _logger;
    private readonly IConnectionMultiplexer _redis;

    public ExpiredTicketHoldBackgroundService(
        IServiceScopeFactory scopeFactory,
        ILogger<ExpiredTicketHoldBackgroundService> logger,
        IConnectionMultiplexer redis)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _redis = redis;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ReleaseExpiredHoldsAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error while releasing expired ticket holds.");
            }

            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        }
    }

    private async Task ReleaseExpiredHoldsAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();

        var dbContext = scope.ServiceProvider.GetRequiredService<TicketDbContext>();
        var ticketService = scope.ServiceProvider.GetRequiredService<ITicketService>();
        var realtimeNotifier = scope.ServiceProvider.GetRequiredService<ITicketRealtimeNotifier>();
        var redisDb = _redis.GetDatabase();
        var strategy = dbContext.Database.CreateExecutionStrategy();

        var releasedCount = await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);

            var now = DateTime.UtcNow;

            var expiredHolds = await dbContext.TicketHolds
                .FromSqlInterpolated($"""
                    SELECT *
                    FROM "TicketHolds"
                    WHERE "Status" = {(int)HoldStatus.Holding}
                      AND "ExpiredAt" <= {now}
                    FOR UPDATE SKIP LOCKED
                    """)
                .Where(x => x.Status == HoldStatus.Holding && x.ExpiredAt <= now)
                .ToListAsync(cancellationToken);

            if (!expiredHolds.Any())
                return 0;

            foreach (var hold in expiredHolds)
            {
                var ticketType = await dbContext.TicketTypes
                    .FromSqlInterpolated($"""
                        SELECT *
                        FROM "TicketTypes"
                        WHERE "Id" = {hold.TicketTypeId}
                        FOR UPDATE
                        """)
                    .FirstOrDefaultAsync(cancellationToken);

                if (ticketType is null)
                    continue;

                ticketType.Release(hold.Quantity);
                hold.Expire();

                await redisDb.KeyDeleteAsync($"ticket-hold:{hold.HoldCode}");
            }

            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return expiredHolds.Count;
        });

        if (releasedCount == 0)
            return;

        var snapshot = await ticketService.GetInventorySnapshotAsync(cancellationToken);
        await realtimeNotifier.BroadcastInventoryChangedAsync("released", snapshot, cancellationToken);

        _logger.LogInformation("Released {Count} expired ticket holds.", releasedCount);
    }
}
