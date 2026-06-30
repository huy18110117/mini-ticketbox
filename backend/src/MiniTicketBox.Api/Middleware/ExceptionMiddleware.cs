using System.Net;
using System.Text.Json;

namespace MiniTicketBox.Api.Middleware;

public class ExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionMiddleware> _logger;

    public ExceptionMiddleware(
        RequestDelegate next,
        ILogger<ExceptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (ArgumentException ex)
        {
            await WriteErrorAsync(
                context,
                HttpStatusCode.BadRequest,
                ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            await WriteErrorAsync(
                context,
                HttpStatusCode.Conflict,
                ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, ex.Message);

            await WriteErrorAsync(
                context,
                HttpStatusCode.InternalServerError,
                "Internal server error.");
        }
    }

    private static async Task WriteErrorAsync(
        HttpContext context,
        HttpStatusCode statusCode,
        string message)
    {
        context.Response.StatusCode = (int)statusCode;
        context.Response.ContentType = "application/json";

        var response = new
        {
            success = false,
            message
        };

        await context.Response.WriteAsync(
            JsonSerializer.Serialize(response));
    }
}