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
            throw new ArgumentException("Mã loại vé là bắt buộc.");

        if (quantity <= 0)
            throw new ArgumentException("Số lượng vé giữ chỗ phải lớn hơn 0.");

        if (expiredAt <= DateTime.UtcNow)
            throw new ArgumentException("Thời gian hết hạn phải ở tương lai.");

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
            throw new InvalidOperationException("Chỉ vé đang được giữ chỗ mới có thể thanh toán.");

        Status = HoldStatus.Paid;
        SetUpdated();
    }

    public void Release()
    {
        if (Status != HoldStatus.Holding)
            throw new InvalidOperationException("Chỉ vé đang được giữ chỗ mới có thể được giải phóng.");

        Status = HoldStatus.Released;
        SetUpdated();
    }

    public void Expire()
    {
        if (Status != HoldStatus.Holding)
            throw new InvalidOperationException("Chỉ vé đang được giữ chỗ mới có thể hết hạn.");

        Status = HoldStatus.Expired;
        SetUpdated();
    }

    private static string GenerateHoldCode()
    {
        return $"HOLD-{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}"[..32];
    }
}
