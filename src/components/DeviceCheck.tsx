import PrejoinCameraCheck from "@/components/video/PrejoinCameraCheck";

export default function DeviceCheck({ onJoin, canJoin = false }: { onJoin?: () => void; canJoin?: boolean }) {
  return <PrejoinCameraCheck onJoin={onJoin} canJoin={canJoin} />;
}