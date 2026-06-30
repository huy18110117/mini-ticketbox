import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { BookingComponent } from './pages/booking/booking.component';
import { AdminDashboardComponent } from './pages/admin-dashboard/admin-dashboard.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'booking', component: BookingComponent },
  { path: 'admin', component: AdminDashboardComponent },
  { path: '**', redirectTo: '' },
];
