namespace MiniTicketBox.Application.Contracts.Responses;

public class ActiveTicketHoldResponse
{
    public Guid Id { get; set; }

    public string HoldCode { get; set; } = string.Empty;

    public Guid TicketTypeId { get; set; }

    public string TicketTypeName { get; set; } = string.Empty;

    public int Quantity { get; set; }

    public DateTime ExpiredAt { get; set; }
}
