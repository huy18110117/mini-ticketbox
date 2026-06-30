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
}