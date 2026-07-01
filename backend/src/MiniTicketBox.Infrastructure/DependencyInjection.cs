using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using MiniTicketBox.Infrastructure.Persistence;
using StackExchange.Redis;
using MiniTicketBox.Application.Interfaces;
using MiniTicketBox.Infrastructure.Services;
using MiniTicketBox.Infrastructure.BackgroundServices;
namespace MiniTicketBox.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddDbContext<TicketDbContext>(options =>
        {
            options.UseNpgsql(
                configuration.GetConnectionString("Postgres"),
                npgsqlOptions => npgsqlOptions.EnableRetryOnFailure(
                    maxRetryCount: 3,
                    maxRetryDelay: TimeSpan.FromSeconds(2),
                    errorCodesToAdd: null));
        });

        services.AddSingleton<IConnectionMultiplexer>(_ =>
        {
            var redisConnectionString = configuration["Redis:ConnectionString"];

            if (string.IsNullOrWhiteSpace(redisConnectionString))
                throw new InvalidOperationException("Thiếu chuỗi kết nối Redis.");

            return ConnectionMultiplexer.Connect(redisConnectionString);
        });
        services.AddScoped<ITicketService, TicketService>();
        services.AddHostedService<ExpiredTicketHoldBackgroundService>();
        return services;
    }
}
