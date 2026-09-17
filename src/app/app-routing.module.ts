import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { MainLayoutComponent } from './layout/main-layout/main-layout.component';
import { LoginComponent } from './login/login.component';
import { ExpenseReviewComponent } from './pages/expense-review/expense-review.component';

const routes: Routes = [
  // Redirect to login
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  // Login layout
  { path: 'login', component: LoginComponent },

  // Protected layout
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: 'expense-review', component: ExpenseReviewComponent }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}