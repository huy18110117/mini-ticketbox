namespace MiniTicketBox.Application.Contracts.Responses;

public class TicketTypeResponse
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public decimal Price { get; set; }

    public int TotalQuantity { get; set; }

    public int AvailableQuantity { get; set; }
}