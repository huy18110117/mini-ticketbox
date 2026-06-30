using MiniTicketBox.Domain.Common;
using MiniTicketBox.Domain.Enums;

namespace MiniTicketBox.Domain.Entities;

public class Order : BaseEntity
{
    public string OrderCode { get; private set; } = string.Empty;

    public decimal TotalAmount { get; private set; }

    public OrderStatus Status { get; private set; } = OrderStatus.Pending;

    public List<OrderItem> Items { get; private set; } = new();

    private Order()
    {
    }

    public Order(decimal totalAmount)
    {
        if (totalAmount < 0)
            throw new ArgumentException("Total amount cannot be negative.");

        OrderCode = GenerateOrderCode();
        TotalAmount = totalAmount;
        Status = OrderStatus.Pending;
    }

    public void AddItem(OrderItem item)
    {
        Items.Add(item);
        SetUpdated();
    }

    public void MarkAsPaid()
    {
        if (Status != OrderStatus.Pending)
            throw new InvalidOperationException("Only pending orders can be paid.");

        Status = OrderStatus.Paid;
        SetUpdated();
    }

    public void Cancel()
    {
        if (Status == OrderStatus.Paid)
            throw new InvalidOperationException("Paid orders cannot be cancelled.");

        Status = OrderStatus.Cancelled;
        SetUpdated();
    }

    private static string GenerateOrderCode()
    {
        return $"ORD-{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}"[..31];
    }
}