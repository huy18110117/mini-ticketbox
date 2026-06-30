using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MiniTicketBox.Domain.Entities;
using MiniTicketBox.Domain.Enums;

namespace MiniTicketBox.Infrastructure.Persistence.Configurations;

public class TicketHoldConfiguration : IEntityTypeConfiguration<TicketHold>
{
    public void Configure(EntityTypeBuilder<TicketHold> builder)
    {
        builder.ToTable("TicketHolds");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.HoldCode)
            .HasMaxLength(50)
            .IsRequired();

        builder.HasIndex(x => x.HoldCode)
            .IsUnique();

        builder.Property(x => x.Quantity)
            .IsRequired();

        builder.Property(x => x.ExpiredAt)
            .IsRequired();

        builder.Property(x => x.Status)
            .HasConversion<int>()
            .IsRequired();

        builder.HasOne(x => x.TicketType)
            .WithMany()
            .HasForeignKey(x => x.TicketTypeId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Property(x => x.CreatedAt)
            .IsRequired();

        builder.Property(x => x.UpdatedAt);
    }
}