import type * as THREE from "three";

export function createDirectionLightFixture(T: typeof import("three")) {
  const object = new T.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const housing = new T.MeshStandardMaterial({ color: "#555d6d", emissive: "#1a1c20", metalness: 0.45, roughness: 0.42 });
  const rimHousing = new T.MeshStandardMaterial({ color: "#868b94", metalness: 0.45, roughness: 0.4 });
  const lamp = new T.MeshBasicMaterial({ color: "#fff2ec" });
  const beam = new T.MeshBasicMaterial({
    color: "#fff2ec", transparent: true, opacity: 0.18, depthWrite: false, side: T.DoubleSide,
  });
  const rimLamp = lamp.clone();
  const rimBeam = beam.clone();
  rimLamp.color.set("#eff6ff");
  rimBeam.color.copy(rimLamp.color);
  materials.push(housing, rimHousing, lamp, beam, rimLamp, rimBeam);

  const bodyGeometry = new T.CylinderGeometry(0.15, 0.19, 0.3, 24);
  const faceGeometry = new T.CircleGeometry(0.13, 24);
  const coneGeometry = new T.CylinderGeometry(0.52, 0.10, 1, 24, 1, true);
  geometries.push(bodyGeometry, faceGeometry, coneGeometry);
  function fixture(scale: number, casing: THREE.Material, lens: THREE.Material, lightBeam: THREE.Material) {
    const group = new T.Group();
    const body = new T.Mesh(bodyGeometry, casing);
    const face = new T.Mesh(faceGeometry, lens);
    face.rotation.x = -Math.PI / 2;
    face.position.y = 0.151;
    const cone = new T.Mesh(coneGeometry, lightBeam);
    group.add(body, face, cone);
    group.scale.setScalar(scale);
    object.add(group);
    return { group, cone };
  }

  const main = fixture(1, housing, lamp, beam);
  const back = fixture(0.7, rimHousing, rimLamp, rimBeam);
  const axis = new T.Vector3(0, 1, 0);
  const direction = new T.Vector3();
  const rearPosition = new T.Vector3(-1.05, 0.8, -1);
  function aim({ group, cone }: ReturnType<typeof fixture>, position: THREE.Vector3, target: THREE.Vector3) {
    group.position.copy(position);
    const distance = direction.subVectors(target, position).length();
    if (distance <= 0.001) return;
    group.quaternion.setFromUnitVectors(axis, direction.multiplyScalar(1 / distance));
    const length = distance / group.scale.y - 0.15;
    cone.scale.y = length;
    cone.position.y = 0.15 + length / 2;
  }

  return {
    object,
    update(position: THREE.Vector3, target: THREE.Vector3, color: string, brightness: number, rim: boolean) {
      aim(main, position, target);
      aim(back, rearPosition, target);
      back.group.visible = rim;
      lamp.color.set(color).multiplyScalar(0.18 + brightness / 125);
      beam.color.set(color);
      beam.opacity = brightness / 350;
    },
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
}
