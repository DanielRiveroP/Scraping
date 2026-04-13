import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

// 1. Importamos ScraperService (el nombre correcto de tu clase)
import { ScraperService } from './scraper'; 

describe('ScraperService', () => {
  // 2. Usamos el nombre correcto aquí
  let service: ScraperService;

  beforeEach(() => {
    // 3. Añadimos provideHttpClient para que la prueba no falle si la ejecutas
    TestBed.configureTestingModule({
      providers: [provideHttpClient()]
    });
    // 4. Inyectamos la clase correcta
    service = TestBed.inject(ScraperService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});