using Microsoft.AspNetCore.SignalR;
using MiniTicketBox.Application.Interfaces;

namespace MiniTicketBox.Api.Hubs;

public class TicketHub : Hub
{
    private readonly ITicketService _ticketService;

    public TicketHub(ITicketService ticketService)
    {
        _ticketService = ticketService;
    }

    public async Task GetSnapshot()
    {
        var snapshot = await _ticketService.GetInventorySnapshotAsync(Context.ConnectionAborted);
        await Clients.Caller.SendAsync("inventoryChanged", "snapshot", snapshot, Context.ConnectionAborted);
    }
}
