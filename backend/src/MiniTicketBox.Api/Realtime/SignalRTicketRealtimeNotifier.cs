using Microsoft.AspNetCore.SignalR;
using MiniTicketBox.Api.Hubs;
using MiniTicketBox.Application.Contracts.Responses;
using MiniTicketBox.Application.Realtime;

namespace MiniTicketBox.Api.Realtime;

public class SignalRTicketRealtimeNotifier : ITicketRealtimeNotifier
{
    private readonly IHubContext<TicketHub> _hubContext;

    public SignalRTicketRealtimeNotifier(IHubContext<TicketHub> hubContext)
    {
        _hubContext = hubContext;
    }

    public Task BroadcastInventoryChangedAsync(
        string reason,
        TicketInventorySnapshotResponse snapshot,
        CancellationToken cancellationToken = default)
    {
        return _hubContext.Clients.All.SendAsync("inventoryChanged", reason, snapshot, cancellationToken);
    }
}
