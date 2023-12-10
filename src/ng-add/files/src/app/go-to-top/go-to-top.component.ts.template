import { Component, ViewEncapsulation, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

@Component({
  selector: 'app-go-to-top',
  standalone: true,
  encapsulation: ViewEncapsulation.ShadowDom,
  template: `
    <button class="go-to-top-btn" (click)="goToTop()"> Top </button>
  `,
  styles: [`
  .go-to-top-btn {
    position: fixed;
    bottom: 20px;
    right: 10px;
    border-radius: .2rem;
    background: black;
    color: white;
    border: 1px solid white;
    padding: 5px 10px;
    cursor: pointer;
    z-index: 1000;
  }
`]
})
export class GoToTopComponent {

  document = inject(DOCUMENT);

  goToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

}



