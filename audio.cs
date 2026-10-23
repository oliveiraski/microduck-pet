// pids dos programas que tao soltando som agora (pico do medidor de cada sessao de audio)
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace Pet {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }

  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int flow, int mask, out IntPtr devs);
    int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice dev);
  }

  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
  }

  [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 {
    int GetAudioSessionControl(IntPtr a, int b, out IntPtr c);
    int GetSimpleAudioVolume(IntPtr a, int b, out IntPtr c);
    int GetSessionEnumerator(out IAudioSessionEnumerator e);
  }

  [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator {
    int GetCount(out int n);
    int GetSession(int i, out IAudioSessionControl2 s);
  }

  [Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    int GetState(out int s);
    int GetDisplayName(out IntPtr n);
    int SetDisplayName(IntPtr a, IntPtr b);
    int GetIconPath(out IntPtr p);
    int SetIconPath(IntPtr a, IntPtr b);
    int GetGroupingParam(out Guid g);
    int SetGroupingParam(IntPtr a, IntPtr b);
    int RegisterAudioSessionNotification(IntPtr a);
    int UnregisterAudioSessionNotification(IntPtr a);
    int GetSessionIdentifier(out IntPtr s);
    int GetSessionInstanceIdentifier(out IntPtr s);
    int GetProcessId(out uint pid);
  }

  [Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioMeterInformation {
    int GetPeakValue(out float p);
  }

  public static class Audio {
    public static uint[] Playing() {
      var res = new List<uint>();
      var en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
      IMMDevice dev;
      if (en.GetDefaultAudioEndpoint(0, 1, out dev) != 0) return res.ToArray();
      var iid = typeof(IAudioSessionManager2).GUID;
      object o;
      dev.Activate(ref iid, 23, IntPtr.Zero, out o);
      IAudioSessionEnumerator se;
      ((IAudioSessionManager2)o).GetSessionEnumerator(out se);
      int n;
      se.GetCount(out n);
      for (int i = 0; i < n; i++) {
        IAudioSessionControl2 s;
        se.GetSession(i, out s);
        uint pid;
        s.GetProcessId(out pid);
        float p;
        ((IAudioMeterInformation)s).GetPeakValue(out p);
        if (p > 0.003f && pid != 0) res.Add(pid);
      }
      return res.ToArray();
    }
  }
}
