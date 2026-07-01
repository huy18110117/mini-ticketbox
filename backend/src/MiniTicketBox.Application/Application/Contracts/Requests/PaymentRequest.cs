namespace MiniTicketBox.Application.Contracts.Requests;

public class PaymentRequest
{
    public string HoldCode { get; set; } = string.Empty;

    public string CustomerName { get; set; } = string.Empty;

    public string CustomerEmail { get; set; } = string.Empty;
}
