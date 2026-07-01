using MiniTicketBox.Domain.Common;

namespace MiniTicketBox.Domain.Entities;

public class OrderItem : BaseEntity
{
    public Guid OrderId { get; private set; }

    public Guid TicketTypeId { get; private set; }

    public int Quantity { get; private set; }

    public decimal UnitPrice { get; private set; }

    public Order? Order { get; private set; }

    public TicketType? TicketType { get; private set; }

    private OrderItem()
    {
    }

    public OrderItem(Guid ticketTypeId, int quantity, decimal unitPrice)
    {
        if (ticketTypeId == Guid.Empty)
            throw new ArgumentException("Loại vé là bắt buộc.");

        if (quantity <= 0)
            throw new ArgumentException("Số lượng phải lớn hơn 0.");

        if (unitPrice < 0)
            throw new ArgumentException("Đơn giá không được âm.");

        TicketTypeId = ticketTypeId;
        Quantity = quantity;
        UnitPrice = unitPrice;
    }

    public decimal TotalPrice => Quantity * UnitPrice;
}
