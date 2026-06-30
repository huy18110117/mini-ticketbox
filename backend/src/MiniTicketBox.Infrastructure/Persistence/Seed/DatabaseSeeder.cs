using Microsoft.EntityFrameworkCore;
using MiniTicketBox.Domain.Entities;

namespace MiniTicketBox.Infrastructure.Persistence.Seed;

public static class DatabaseSeeder
{
    public static async Task SeedAsync(TicketDbContext context)
    {
        await context.Database.MigrateAsync();

        if (await context.TicketTypes.AnyAsync())
            return;

        var ticketTypes = new List<TicketType>
        {
            new("VIP", 2_000_000, 100),
            new("Standard", 1_000_000, 300),
            new("Economy", 500_000, 100)
        };

        await context.TicketTypes.AddRangeAsync(ticketTypes);
        await context.SaveChangesAsync();
    }
}