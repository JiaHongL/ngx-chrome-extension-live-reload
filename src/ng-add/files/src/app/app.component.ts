import { ApplicationRef, Component, ComponentRef, ViewContainerRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { GoToTopComponent } from './go-to-top/go-to-top.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  template: ``,
  styles: [],
})
export class AppComponent {

  private componentRef: ComponentRef<GoToTopComponent>;
  viewContainerRef = inject(ViewContainerRef);
  appRef = inject(ApplicationRef);

  constructor() {
    this.componentRef = this.viewContainerRef.createComponent(GoToTopComponent);
    document.body.appendChild(this.componentRef.location.nativeElement);
  }

}
