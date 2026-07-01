using Microsoft.AspNetCore.Mvc;
using MiniTicketBox.Application.Contracts.Requests;
using MiniTicketBox.Application.Interfaces;

namespace MiniTicketBox.Api.Controllers;

[ApiController]
[Route("api/tickets")]
public class TicketsController : ControllerBase
{
    private readonly ITicketService _ticketService;

    public TicketsController(ITicketService ticketService)
    {
        _ticketService = ticketService;
    }

    [HttpGet]
    public async Task<IActionResult> GetTicketTypes(CancellationToken cancellationToken)
    {
        var result = await _ticketService.GetTicketTypesAsync(cancellationToken);

        return Ok(result);
    }

    [HttpGet("snapshot")]
    public async Task<IActionResult> GetInventorySnapshot(CancellationToken cancellationToken)
    {
        var result = await _ticketService.GetInventorySnapshotAsync(cancellationToken);

        return Ok(result);
    }

    [HttpGet("admin/dashboard")]
    public async Task<IActionResult> GetAdminDashboard(CancellationToken cancellationToken)
    {
        var result = await _ticketService.GetAdminDashboardAsync(cancellationToken);

        return Ok(result);
    }

    [HttpPost("reserve")]
    public async Task<IActionResult> Reserve(
        [FromBody] ReserveTicketRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _ticketService.ReserveAsync(request, cancellationToken);

        return Ok(result);
    }
    [HttpPost("pay")]
    public async Task<IActionResult> Pay(
        [FromBody] PaymentRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _ticketService.PayAsync(request, cancellationToken);

        return Ok(result);
    }

    [HttpPost("cancel-hold")]
    public async Task<IActionResult> CancelHold(
        [FromBody] CancelTicketHoldRequest request,
        CancellationToken cancellationToken)
    {
        await _ticketService.CancelHoldAsync(request, cancellationToken);

        return NoContent();
    }
}
