import { Redirect } from 'expo-router';

// La pestaña "+" abre el modal de nuevo movimiento (ver _layout). Esta ruta es sólo un respaldo.
export default function Add() {
  return <Redirect href="/transaction/new" />;
}
