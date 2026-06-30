namespace MiniTicketBox.Application.Contracts.Responses;

public class AdminDashboardResponse
{
    public int TotalSold { get; set; }

    public int TotalHolding { get; set; }

    public decimal Revenue { get; set; }

    public DateTime ServerTimeUtc { get; set; }

    public List<ActiveTicketHoldResponse> ActiveHolds { get; set; } = new();
}
