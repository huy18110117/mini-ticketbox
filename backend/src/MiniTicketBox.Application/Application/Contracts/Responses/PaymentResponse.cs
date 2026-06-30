namespace MiniTicketBox.Application.Contracts.Responses;

public class PaymentResponse
{
    public string OrderCode { get; set; } = string.Empty;

    public decimal TotalAmount { get; set; }

    public string Status { get; set; } = string.Empty;
}