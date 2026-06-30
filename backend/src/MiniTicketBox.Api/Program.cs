using MiniTicketBox.Infrastructure;
using MiniTicketBox.Infrastructure.Persistence;
using MiniTicketBox.Infrastructure.Persistence.Seed;
using MiniTicketBox.Api.Extensions;
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

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

app.MapControllers();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<TicketDbContext>();
    await DatabaseSeeder.SeedAsync(dbContext);
}

app.Run();