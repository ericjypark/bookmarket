import { create } from 'zustand';
import { type ModalId } from '~/app/_common/constants/modal-id.constants';

interface AppState {
  modalMap: Map<string, React.ReactNode>;
}

interface AppAction {
  openModal: (params: { id: ModalId; content: React.ReactNode }) => void;
  closeModal: (params: { id: ModalId }) => void;
}

export const useAppState = create<AppState & AppAction>(set => ({
  // State
  modalMap: new Map(),

  // Action
  openModal: ({ id, content }: Parameters<AppAction['openModal']>[0]) =>
    set(state => {
      const newModalMap = new Map(state.modalMap);
      newModalMap.set(id, content);

      return { modalMap: newModalMap };
    }),
  closeModal: ({ id }: Parameters<AppAction['closeModal']>[0]) =>
    set(state => {
      const newModalMap = new Map(state.modalMap);
      newModalMap.delete(id);

      return { modalMap: newModalMap };
    }),
}));
