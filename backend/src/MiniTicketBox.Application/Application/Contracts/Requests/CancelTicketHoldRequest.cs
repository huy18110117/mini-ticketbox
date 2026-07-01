namespace MiniTicketBox.Application.Contracts.Requests;

public class CancelTicketHoldRequest
{
    public string HoldCode { get; set; } = string.Empty;
}
