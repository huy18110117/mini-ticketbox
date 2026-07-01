using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using MiniTicketBox.Infrastructure.Persistence;

#nullable disable

namespace MiniTicketBox.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(TicketDbContext))]
    [Migration("20260701043000_AddTicketHoldLoadTestIndexes")]
    public partial class AddTicketHoldLoadTestIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_TicketHolds_Status_ExpiredAt",
                table: "TicketHolds",
                columns: new[] { "Status", "ExpiredAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TicketHolds_Status_ExpiredAt",
                table: "TicketHolds");
        }
    }
}
