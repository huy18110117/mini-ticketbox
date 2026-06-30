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
            throw new ArgumentException("Ticket type is required.");

        if (quantity <= 0)
            throw new ArgumentException("Quantity must be greater than zero.");

        if (unitPrice < 0)
            throw new ArgumentException("Unit price cannot be negative.");

        TicketTypeId = ticketTypeId;
        Quantity = quantity;
        UnitPrice = unitPrice;
    }

    public decimal TotalPrice => Quantity * UnitPrice;
}