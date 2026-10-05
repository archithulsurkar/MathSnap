import { ChangeDetectionStrategy, Component, ElementRef, computed, input, model, signal, viewChild } from '@angular/core';
import { isTooSmall, moveRegion, rectFromDrag, type Point, type Rect, type Region, type RegionKind } from './regions';

/** Drags smaller than this, in screen pixels on either axis, are taken as clicks. */
const MIN_BOX_PX = 8;

let nextId = 0;

/**
 * Draws numbered text/maths boxes over one page, in reading order.
 *
 * Drawing is pointer-only (mouse, pen or touch). Everything else — changing a
 * box's kind, reordering, deleting — is also in the list beside the page,
 * which is fully keyboard-operable, so the boxes are a visual aid and the list
 * is the accessible way to edit them.
 */
@Component({
  selector: 'app-region-editor',
  templateUrl: './region-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown)': 'onKeydown($event)' },
})
export class RegionEditorComponent {
  readonly pageUrl = input.required<string>();
  /** "Page 2 of 3", for the image's alt text and the list's heading. */
  readonly pageLabel = input('Page');
  /** How many more boxes the upload may take, across all pages. */
  readonly remaining = input(Number.POSITIVE_INFINITY);
  readonly regions = model.required<Region[]>();

  readonly kind = signal<RegionKind>('text');
  readonly selectedId = signal<string | null>(null);
  readonly draft = signal<Rect | null>(null);
  /** Announced to screen readers after each change. */
  readonly announcement = signal('');

  readonly canAdd = computed(() => this.remaining() > 0);

  private readonly overlay = viewChild.required<ElementRef<HTMLElement>>('overlay');
  private dragStart: Point | null = null;

  setKind(kind: RegionKind): void {
    this.kind.set(kind);
    this.announcement.set(`New boxes will be ${kind === 'text' ? 'text' : 'maths'}.`);
  }

  onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const overlay = this.overlay().nativeElement;
    // Take focus so T, M and Delete work straight after drawing.
    overlay.focus({ preventScroll: true });

    if (!this.canAdd()) {
      this.announcement.set('No more boxes can be added to this upload.');
      return;
    }

    event.preventDefault();
    overlay.setPointerCapture(event.pointerId);
    this.dragStart = this.toPage(event);
    this.draft.set(rectFromDrag(this.dragStart, this.dragStart));
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.dragStart) return;
    this.draft.set(rectFromDrag(this.dragStart, this.toPage(event)));
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.dragStart) return;
    const rect = rectFromDrag(this.dragStart, this.toPage(event));
    this.dragStart = null;
    this.draft.set(null);

    const { width, height } = this.overlay().nativeElement.getBoundingClientRect();
    if (isTooSmall(rect, MIN_BOX_PX, { width, height })) {
      this.selectedId.set(null);
      return;
    }

    const region: Region = { id: `r${++nextId}`, kind: this.kind(), ...rect };
    this.regions.update((regions) => [...regions, region]);
    this.selectedId.set(region.id);
    this.announcement.set(`Box ${this.regions().length} added, ${this.kindName(region.kind)}.`);
  }

  onPointerCancel(): void {
    this.dragStart = null;
    this.draft.set(null);
  }

  select(id: string): void {
    this.selectedId.set(id);
  }

  toggleKind(index: number): void {
    const region = this.regions()[index];
    const kind: RegionKind = region.kind === 'text' ? 'math' : 'text';
    this.regions.update((regions) => regions.map((r, i) => (i === index ? { ...r, kind } : r)));
    this.announcement.set(`Box ${index + 1} is now ${this.kindName(kind)}.`);
  }

  move(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.regions().length) return;
    this.regions.update((regions) => moveRegion(regions, index, delta));
    this.announcement.set(`Box moved to position ${target + 1}.`);
  }

  remove(index: number): void {
    const region = this.regions()[index];
    this.regions.update((regions) => regions.filter((_, i) => i !== index));
    if (this.selectedId() === region?.id) this.selectedId.set(null);
    this.announcement.set(`Box ${index + 1} deleted.`);
  }

  clear(): void {
    this.regions.set([]);
    this.selectedId.set(null);
    this.announcement.set('All boxes on this page deleted.');
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

    const key = event.key.toLowerCase();
    if (key === 't' || key === 'm') {
      this.setKind(key === 't' ? 'text' : 'math');
      event.preventDefault();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      const index = this.regions().findIndex((region) => region.id === this.selectedId());
      if (index === -1) return;
      this.remove(index);
      event.preventDefault();
    }
  }

  kindName(kind: RegionKind): string {
    return kind === 'text' ? 'text' : 'maths';
  }

  /**
   * Text boxes are solid blue, maths boxes dashed amber: the dash and the T/M
   * badge carry the kind for readers who cannot tell the colours apart.
   */
  boxClass(kind: RegionKind, selected: boolean): string {
    const colour = kind === 'text' ? 'border-sky-600 bg-sky-600/10' : 'border-amber-600 border-dashed bg-amber-600/10';
    return selected ? `${colour} ring-4 ring-accent` : colour;
  }

  toggleClass(kind: RegionKind): string {
    if (this.kind() !== kind) return '';
    return kind === 'text' ? '!border-sky-600 !bg-sky-600/10' : '!border-amber-600 !bg-amber-600/10';
  }

  /** Position style for a box, as percentages of the page. */
  boxStyle(rect: Rect): Record<string, string> {
    return {
      left: `${rect.x * 100}%`,
      top: `${rect.y * 100}%`,
      width: `${rect.w * 100}%`,
      height: `${rect.h * 100}%`,
    };
  }

  private toPage(event: PointerEvent): Point {
    const bounds = this.overlay().nativeElement.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    };
  }
}
