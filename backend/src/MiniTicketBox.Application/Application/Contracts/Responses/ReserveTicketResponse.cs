namespace MiniTicketBox.Application.Contracts.Responses;

public class ReserveTicketResponse
{
    public string HoldCode { get; set; } = string.Empty;

    public DateTime ExpiredAt { get; set; }
}