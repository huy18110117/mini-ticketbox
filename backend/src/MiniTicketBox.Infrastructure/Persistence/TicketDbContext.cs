using Microsoft.EntityFrameworkCore;
using MiniTicketBox.Domain.Entities;

namespace MiniTicketBox.Infrastructure.Persistence;

public class TicketDbContext : DbContext
{
    public TicketDbContext(DbContextOptions<TicketDbContext> options)
        : base(options)
    {
    }

    public DbSet<TicketType> TicketTypes => Set<TicketType>();

    public DbSet<TicketHold> TicketHolds => Set<TicketHold>();

    public DbSet<Order> Orders => Set<Order>();

    public DbSet<OrderItem> OrderItems => Set<OrderItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(TicketDbContext).Assembly);

        base.OnModelCreating(modelBuilder);
    }
}