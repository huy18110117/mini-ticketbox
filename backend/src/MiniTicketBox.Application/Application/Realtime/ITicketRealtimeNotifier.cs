using MiniTicketBox.Application.Contracts.Responses;

namespace MiniTicketBox.Application.Realtime;

public interface ITicketRealtimeNotifier
{
    Task BroadcastInventoryChangedAsync(
        string reason,
        TicketInventorySnapshotResponse snapshot,
        CancellationToken cancellationToken = default);
}
