'use client';

import { useState, type DragEvent } from 'react';

/** 数组元素从 from 移到 to（越界时原样返回） */
export function moveTo<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return list;
  if (from === to) return list;
  const next = [...list];
  const [picked] = next.splice(from, 1);
  next.splice(to, 0, picked);
  return next;
}

/**
 * 原生 HTML5 拖拽排序（零依赖）。一个实例可管理多个互不相通的列表：
 * 拖柄用 handleProps(listKey, index)，落点容器用 targetProps(listKey, index, onReorder)。
 * 只允许同一 listKey 内互拖。
 */
export function useDragSort() {
  const [drag, setDrag] = useState<{ list: string; index: number } | null>(null);
  const [over, setOver] = useState<{ list: string; index: number } | null>(null);

  const reset = () => {
    setDrag(null);
    setOver(null);
  };

  const handleProps = (list: string, index: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      // 部分浏览器要求 setData 才启动拖拽
      e.dataTransfer.setData('text/plain', `${list}:${index}`);
      setDrag({ list, index });
    },
    onDragEnd: reset,
  });

  const targetProps = (
    list: string,
    index: number,
    onReorder: (from: number, to: number) => void,
  ) => ({
    onDragOver: (e: DragEvent) => {
      if (drag?.list !== list) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (over?.list !== list || over.index !== index) setOver({ list, index });
    },
    onDragLeave: () => {
      if (over?.list === list && over.index === index) setOver(null);
    },
    onDrop: (e: DragEvent) => {
      if (drag?.list !== list) return;
      e.preventDefault();
      if (drag.index !== index) onReorder(drag.index, index);
      reset();
    },
  });

  const isDropTarget = (list: string, index: number) =>
    drag?.list === list &&
    over?.list === list &&
    over.index === index &&
    drag.index !== index;

  const isDragging = (list: string, index: number) =>
    drag?.list === list && drag.index === index;

  return { handleProps, targetProps, isDropTarget, isDragging };
}
