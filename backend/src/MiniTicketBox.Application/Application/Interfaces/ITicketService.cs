using MiniTicketBox.Application.Contracts.Requests;
using MiniTicketBox.Application.Contracts.Responses;

namespace MiniTicketBox.Application.Interfaces;

public interface ITicketService
{
    Task<ReserveTicketResponse> ReserveAsync(
        ReserveTicketRequest request,
        CancellationToken cancellationToken = default);
}