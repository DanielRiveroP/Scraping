import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Resena {
  autor: string;
  puntuacion: number;
  fecha: string;
  texto: string;
}

export interface BusinessData {
  nombre: string;
  puntuacion: string;
  numeroResenas: string;
  horario: string;
  telefono: string;
  sitioWeb: string;
  urlGoogle: string;
  resenas?: Resena[];
}

@Injectable({
  providedIn: 'root'
})
export class ScraperService {
  private apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  scrapeBusiness(companyName: string): Observable<BusinessData> {
    const body = { companyName: companyName };
    console.log('📤 Enviando al servidor:', body);
    return this.http.post<BusinessData>(`${this.apiUrl}/scrape`, body);
  }

  agregarResena(companyName: string, autor: string, puntuacion: number, texto: string): Observable<any> {
    const body = { companyName, autor, puntuacion, texto };
    console.log('➕ Agregando reseña:', body);
    return this.http.post(`${this.apiUrl}/add-resena`, body);
  }

  obtenerResenas(companyName: string): Observable<{ resenas: Resena[] }> {
    const empresaCodificada = encodeURIComponent(companyName);
    console.log('📖 Obteniendo reseñas de:', companyName);
    return this.http.get<{ resenas: Resena[] }>(`${this.apiUrl}/resenas/${empresaCodificada}`);
  }
}