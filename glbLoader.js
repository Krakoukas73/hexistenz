/**
 * Factory GLTFLoader pré-configuré avec MeshoptDecoder.
 * Tous les chargements GLB du projet passent par ici pour supporter
 * les fichiers compressés avec `gltf-transform --compress meshopt`.
 */
import { GLTFLoader }    from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/meshopt_decoder.module.js';

export function createGLTFLoader() {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}
