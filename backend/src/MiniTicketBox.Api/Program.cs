using MiniTicketBox.Infrastructure;
using MiniTicketBox.Infrastructure.Persistence;
using MiniTicketBox.Infrastructure.Persistence.Seed;
using MiniTicketBox.Api.Extensions;
using MiniTicketBox.Api.Hubs;
using MiniTicketBox.Api.Realtime;
using MiniTicketBox.Application.Realtime;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy.WithOrigins("http://localhost:4200")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});
builder.Services.AddSignalR();
builder.Services.AddScoped<ITicketRealtimeNotifier, SignalRTicketRealtimeNotifier>();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddInfrastructure(builder.Configuration);

var app = builder.Build();
app.UseGlobalException();
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseCors("Frontend");

app.MapControllers();
app.MapHub<TicketHub>("/hubs/tickets");

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<TicketDbContext>();
    await DatabaseSeeder.SeedAsync(dbContext);
}

app.Run();
