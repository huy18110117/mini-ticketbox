namespace MiniTicketBox.Application.Contracts.Requests;

public class ReserveTicketRequest
{
    public Guid TicketTypeId { get; set; }

    public int Quantity { get; set; }
}