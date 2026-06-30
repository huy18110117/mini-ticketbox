using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
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
        var redisDb = _redis.GetDatabase();

        var now = DateTime.UtcNow;

        var expiredHolds = await dbContext.TicketHolds
            .Include(x => x.TicketType)
            .Where(x => x.Status == HoldStatus.Holding && x.ExpiredAt <= now)
            .ToListAsync(cancellationToken);

        if (!expiredHolds.Any())
            return;

        foreach (var hold in expiredHolds)
        {
            if (hold.TicketType is null)
                continue;

            hold.TicketType.Release(hold.Quantity);
            hold.Expire();

            await redisDb.KeyDeleteAsync($"ticket-hold:{hold.HoldCode}");
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Released {Count} expired ticket holds.", expiredHolds.Count);
    }
}