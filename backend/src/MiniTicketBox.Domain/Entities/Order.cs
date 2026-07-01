using MiniTicketBox.Domain.Common;
using MiniTicketBox.Domain.Enums;

namespace MiniTicketBox.Domain.Entities;

public class Order : BaseEntity
{
    public string OrderCode { get; private set; } = string.Empty;

    public decimal TotalAmount { get; private set; }

    public OrderStatus Status { get; private set; } = OrderStatus.Pending;

    public string CustomerName { get; private set; } = string.Empty;

    public string CustomerEmail { get; private set; } = string.Empty;

    public List<OrderItem> Items { get; private set; } = new();

    private Order()
    {
    }

    public Order(decimal totalAmount, string customerName, string customerEmail)
    {
        if (totalAmount < 0)
            throw new ArgumentException("Tổng tiền không được âm.");

        if (string.IsNullOrWhiteSpace(customerName))
            throw new ArgumentException("Tên khách hàng là bắt buộc.");

        if (string.IsNullOrWhiteSpace(customerEmail))
            throw new ArgumentException("Email khách hàng là bắt buộc.");

        OrderCode = GenerateOrderCode();
        TotalAmount = totalAmount;
        CustomerName = customerName.Trim();
        CustomerEmail = customerEmail.Trim().ToLowerInvariant();
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
            throw new InvalidOperationException("Chỉ đơn hàng đang chờ xử lý mới có thể thanh toán.");

        Status = OrderStatus.Paid;
        SetUpdated();
    }

    public void Cancel()
    {
        if (Status == OrderStatus.Paid)
            throw new InvalidOperationException("Đơn hàng đã thanh toán không thể hủy.");

        Status = OrderStatus.Cancelled;
        SetUpdated();
    }

    private static string GenerateOrderCode()
    {
        return $"ORD-{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}"[..31];
    }
}
