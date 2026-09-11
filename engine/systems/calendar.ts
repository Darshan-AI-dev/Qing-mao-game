/**
 * The in-game calendar. Day 1 is the morning he wakes in the bamboo room.
 *
 * Seasons come from the canon bible, weather follows them, and the clock is what
 * makes class attendance and clan missions compete with cultivation. Advancing a
 * day is the single place upkeep is charged, so time passing always costs something.
 */
import { bus } from '../core/bus';
import { daysPerYear, seasonForDay } from '../../canon/index';
import type { Rng } from '../core/rng';
import type { SaveGameV5 } from '../save/schema';
import type { Upkeep } from './upkeep';

export class Calendar {
  constructor(private save: SaveGameV5, private upkeep: Upkeep, private rng: Rng) {}

  get day(): number {
    return this.save.calendar.day;
  }

  get year(): number {
    return this.save.calendar.year;
  }

  get season(): string {
    return seasonForDay(this.save.calendar.day).id;
  }

  get weather(): string {
    return this.save.calendar.weather;
  }

  /** Advances the clock and charges upkeep for each day that passes. */
  advance(days = 1, forcedWeather?: string): void {
    for (let i = 0; i < days; i++) {
      this.save.calendar.day += 1;
      if (this.save.calendar.day > daysPerYear) {
        this.save.calendar.day = 1;
        this.save.calendar.year += 1;
      }
      const season = seasonForDay(this.save.calendar.day);
      this.save.calendar.weather = forcedWeather ?? this.rng.pick(season.weather) ?? 'clear';
      this.upkeep.tick(this.save.calendar.day);
      bus.emit('day.advance', { day: this.save.calendar.day, season: season.id, weather: this.save.calendar.weather });
      this.emitWeather();
    }
  }

  /** Scene scripts can pin the weather; the chapters decide, not the dice. */
  setWeather(weather: string): void {
    this.save.calendar.weather = weather;
    this.emitWeather();
  }

  private emitWeather(): void {
    const intensity = 0.4 + this.rng.next() * 0.6;
    switch (this.save.calendar.weather) {
      case 'rain': bus.emit('weather.rain', { intensity }); break;
      case 'snow': bus.emit('weather.snow', { intensity }); break;
      case 'mist': bus.emit('weather.mist', { intensity }); break;
      case 'storm': bus.emit('weather.storm', { intensity }); break;
      default: bus.emit('weather.clear', {});
    }
  }

  label(): string {
    const season = seasonForDay(this.save.calendar.day);
    return `${season.name}, day ${this.save.calendar.day}${this.save.calendar.year > 1 ? `, year ${this.save.calendar.year}` : ''}`;
  }
}
