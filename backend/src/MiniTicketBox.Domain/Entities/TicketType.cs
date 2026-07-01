using MiniTicketBox.Domain.Common;

namespace MiniTicketBox.Domain.Entities;

public class TicketType : BaseEntity
{
    public string Name { get; private set; } = string.Empty;

    public decimal Price { get; private set; }

    public int TotalQuantity { get; private set; }

    public int AvailableQuantity { get; private set; }

    private TicketType()
    {
    }

    public TicketType(string name, decimal price, int totalQuantity)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Tên loại vé là bắt buộc.");

        if (price < 0)
            throw new ArgumentException("Giá vé không được âm.");

        if (totalQuantity <= 0)
            throw new ArgumentException("Tổng số lượng vé phải lớn hơn 0.");

        Name = name;
        Price = price;
        TotalQuantity = totalQuantity;
        AvailableQuantity = totalQuantity;
    }

    public void Reserve(int quantity)
    {
        if (quantity <= 0)
            throw new ArgumentException("Số lượng vé đặt giữ phải lớn hơn 0.");

        if (AvailableQuantity < quantity)
            throw new InvalidOperationException("Không đủ vé khả dụng.");

        AvailableQuantity -= quantity;
        SetUpdated();
    }

    public void Release(int quantity)
    {
        if (quantity <= 0)
            throw new ArgumentException("Số lượng vé cần giải phóng phải lớn hơn 0.");

        AvailableQuantity += quantity;

        if (AvailableQuantity > TotalQuantity)
            AvailableQuantity = TotalQuantity;

        SetUpdated();
    }

    public void MarkSold(int quantity)
    {
        if (quantity <= 0)
            throw new ArgumentException("Số lượng vé đã bán phải lớn hơn 0.");

        SetUpdated();
    }
}
