using MiniTicketBox.Application.Contracts.Requests;
using MiniTicketBox.Application.Contracts.Responses;

namespace MiniTicketBox.Application.Interfaces;

public interface ITicketService
{
    Task<List<TicketTypeResponse>> GetTicketTypesAsync(
        CancellationToken cancellationToken = default);

    Task<ReserveTicketResponse> ReserveAsync(
        ReserveTicketRequest request,
        CancellationToken cancellationToken = default);
        
    Task<PaymentResponse> PayAsync(
        PaymentRequest request,
        CancellationToken cancellationToken = default);

    Task<TicketInventorySnapshotResponse> GetInventorySnapshotAsync(
        CancellationToken cancellationToken = default);

    Task<AdminDashboardResponse> GetAdminDashboardAsync(
        CancellationToken cancellationToken = default);
}
