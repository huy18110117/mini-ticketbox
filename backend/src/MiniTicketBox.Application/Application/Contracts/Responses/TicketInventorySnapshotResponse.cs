namespace MiniTicketBox.Application.Contracts.Responses;

public class TicketInventorySnapshotResponse
{
    public DateTime ServerTimeUtc { get; set; }

    public List<TicketTypeResponse> TicketTypes { get; set; } = new();

    public int TotalAvailable { get; set; }

    public int TotalSold { get; set; }

    public int TotalHolding { get; set; }

    public decimal Revenue { get; set; }
}
