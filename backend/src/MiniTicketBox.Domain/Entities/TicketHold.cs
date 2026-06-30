using MiniTicketBox.Domain.Common;
using MiniTicketBox.Domain.Enums;

namespace MiniTicketBox.Domain.Entities;

public class TicketHold : BaseEntity
{
    public string HoldCode { get; private set; } = string.Empty;

    public Guid TicketTypeId { get; private set; }

    public int Quantity { get; private set; }

    public DateTime ExpiredAt { get; private set; }

    public HoldStatus Status { get; private set; } = HoldStatus.Holding;

    public TicketType? TicketType { get; private set; }

    private TicketHold()
    {
    }

    public TicketHold(Guid ticketTypeId, int quantity, DateTime expiredAt)
    {
        if (ticketTypeId == Guid.Empty)
            throw new ArgumentException("Ticket type id is required.");

        if (quantity <= 0)
            throw new ArgumentException("Hold quantity must be greater than zero.");

        if (expiredAt <= DateTime.UtcNow)
            throw new ArgumentException("Expired time must be in the future.");

        HoldCode = GenerateHoldCode();
        TicketTypeId = ticketTypeId;
        Quantity = quantity;
        ExpiredAt = expiredAt;
        Status = HoldStatus.Holding;
    }

    public bool IsExpired(DateTime now)
    {
        return Status == HoldStatus.Holding && ExpiredAt <= now;
    }

    public void MarkAsPaid()
    {
        if (Status != HoldStatus.Holding)
            throw new InvalidOperationException("Only holding tickets can be paid.");

        Status = HoldStatus.Paid;
        SetUpdated();
    }

    public void Release()
    {
        if (Status != HoldStatus.Holding)
            throw new InvalidOperationException("Only holding tickets can be released.");

        Status = HoldStatus.Released;
        SetUpdated();
    }

    public void Expire()
    {
        if (Status != HoldStatus.Holding)
            throw new InvalidOperationException("Only holding tickets can be expired.");

        Status = HoldStatus.Expired;
        SetUpdated();
    }

    private static string GenerateHoldCode()
    {
        return $"HOLD-{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}"[..32];
    }
}