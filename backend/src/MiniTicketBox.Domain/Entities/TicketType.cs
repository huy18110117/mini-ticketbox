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
            throw new ArgumentException("Ticket type name is required.");

        if (price < 0)
            throw new ArgumentException("Ticket price cannot be negative.");

        if (totalQuantity <= 0)
            throw new ArgumentException("Total quantity must be greater than zero.");

        Name = name;
        Price = price;
        TotalQuantity = totalQuantity;
        AvailableQuantity = totalQuantity;
    }

    public void Reserve(int quantity)
    {
        if (quantity <= 0)
            throw new ArgumentException("Reserve quantity must be greater than zero.");

        if (AvailableQuantity < quantity)
            throw new InvalidOperationException("Not enough tickets available.");

        AvailableQuantity -= quantity;
        SetUpdated();
    }

    public void Release(int quantity)
    {
        if (quantity <= 0)
            throw new ArgumentException("Release quantity must be greater than zero.");

        AvailableQuantity += quantity;

        if (AvailableQuantity > TotalQuantity)
            AvailableQuantity = TotalQuantity;

        SetUpdated();
    }

    public void MarkSold(int quantity)
    {
        if (quantity <= 0)
            throw new ArgumentException("Sold quantity must be greater than zero.");

        SetUpdated();
    }
}