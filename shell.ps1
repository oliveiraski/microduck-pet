# botoes da barra de tarefas (a do win11 eh xaml, so da pra ler por ui automation)
# o que ta tocando (app + titulo) e quem ta soltando som. solta uma linha json a cada 2s
# sem isso os acentos do titulo chegam quebrados e nao batem com a janela
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Runtime.WindowsRuntime
Add-Type -Path (Join-Path $PSScriptRoot 'audio.cs')
Add-Type -Namespace Pet -Name Dpi -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);'
[Pet.Dpi]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null

$A = [System.Windows.Automation.AutomationElement]
$T = [System.Windows.Automation.TreeScope]
$btn = New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
$bars = New-Object System.Windows.Automation.OrCondition(
  (New-Object System.Windows.Automation.PropertyCondition($A::ClassNameProperty, 'Shell_TrayWnd')),
  (New-Object System.Windows.Automation.PropertyCondition($A::ClassNameProperty, 'Shell_SecondaryTrayWnd')))

$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$M = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$MP = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$mgr = $null
try { $mgr = Await ($M::RequestAsync()) $M } catch { }
# o chrome diz que tudo eh Music entao nao da pra confiar no tipo, quem decide eh o main.js
function js($s) { '"' + ((("$s" -replace '\\', '\\') -replace '"', '\"') -replace '[\x00-\x1f]', ' ') + '"' }

$n = 0
while ($true) {
  # barra so a cada 3 voltas, muda pouco
  if ($n % 3 -eq 0) {
    $tb = New-Object System.Collections.ArrayList
    try {
      foreach ($b in $A::RootElement.FindAll($T::Children, $bars)) {
        foreach ($i in $b.FindAll($T::Descendants, $btn)) {
          $r = $i.Current.BoundingRectangle
          if ($r.IsEmpty -or $r.Width -lt 4 -or $i.Current.IsOffscreen) { continue }
          [void]$tb.Add("[$([int]$r.X),$([int]$r.Y),$([int]$r.Width),$([int]$r.Height)]")
        }
      }
    } catch { }
  }
  $media = New-Object System.Collections.ArrayList
  try {
    foreach ($s in $mgr.GetSessions()) {
      $p = $s.GetPlaybackInfo()
      if ($p.PlaybackStatus -ne 'Playing') { continue }
      $app = $s.SourceAppUserModelId
      $title = ''
      try { $title = (Await ($s.TryGetMediaPropertiesAsync()) $MP).Title } catch { }
      [void]$media.Add('{"app":' + (js $app) + ',"title":' + (js $title) + '}')
    }
  } catch { }
  # tem site/player que nao avisa o windows, entao olha quem ta fazendo barulho
  $audio = New-Object System.Collections.ArrayList
  try {
    foreach ($id in [Pet.Audio]::Playing()) {
      $pn = (Get-Process -Id $id -ErrorAction SilentlyContinue).ProcessName
      if ($pn -and -not $audio.Contains((js $pn.ToLower()))) { [void]$audio.Add((js $pn.ToLower())) }
    }
  } catch { }
  [Console]::Out.WriteLine('{"tb":[' + ($tb -join ',') + '],"media":[' + ($media -join ',') + '],"audio":[' + ($audio -join ',') + ']}')
  [Console]::Out.Flush()
  $n++
  Start-Sleep -Seconds 3
}
