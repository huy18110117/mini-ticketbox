using System.ComponentModel.DataAnnotations;

namespace MiniTicketBox.Application.Contracts.Requests;

public class ReserveTicketRequest
{
    [Required]
    public Guid TicketTypeId { get; set; }

    [Range(1, 10, ErrorMessage = "Số lượng vé phải nằm trong khoảng 1 đến 10.")]
    public int Quantity { get; set; }
}
